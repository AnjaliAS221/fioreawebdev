const mongoose = require('mongoose');
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const User = require("../../models/userSchema");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");



const getProductAddPage = async (req, res) => {
    try {
        const category = await Category.find({ isListed: true });
        res.render("product-add", {
            cat: category,
            product: null
        });
    } catch (error) {
        console.error("Error in getProductAddPage:", error);
        res.redirect("/admin/pageerror");
    }
}


const addProducts = async (req, res) => {
    try {
        const { productName, description, regularPrice, salePrice, category } = req.body;

        const variants = JSON.parse(req.body.variantsData);

        if (!variants.length || variants.some(v => !v.color || !v.sizes.length)) {
            req.flash('error_msg', 'Please add valid product variants with colors and sizes.');
            return res.redirect("/admin/products");
        }


        const productExists = await Product.findOne({ productName });
        if (productExists) {
            req.flash('error_msg', 'Product already exists, please try with another name.');
            return res.redirect("/admin/products");
        }


        if (!mongoose.Types.ObjectId.isValid(category)) {
            req.flash('error_msg', 'Invalid category format');
            return res.redirect("/admin/products");
        }

        const categoryId = await Category.findById(category);
        if (!categoryId) {
            req.flash('error_msg', 'Selected category not found');
            return res.redirect("/admin/products");
        }


        const images = [];
        if (req.files && req.files.length > 0) {
            for (let i = 0; i < req.files.length; i++) {
                const originalImagePath = req.files[i].path;

                const resizedImagePath = path.join('public', 'uploads', 'product-images', req.files[i].filename);
                await sharp(originalImagePath).resize({ width: 440, height: 440 }).toFile(resizedImagePath);
                images.push(req.files[i].filename);
            }
        }


        const newProduct = new Product({
            productName,
            description,
            category: categoryId._id,
            regularPrice,
            salePrice,
            productOffer: req.body.productOffer || 0,
            variants,
            productImage: images,
            isBlocked: false,
            status: 'Available',
        });

        await newProduct.save();
        req.flash('success_msg', 'Product added successfully!');
        res.redirect("/admin/products");
    } catch (error) {
        console.error("Error saving product:", error);
        req.flash('error_msg', 'An error occurred while saving the product.');
        res.redirect("/admin/pageerror");
    }
};



const getAllProducts = async (req, res) => {
    try {
        const search = req.query.search || "";
        const page = parseInt(req.query.page) || 1;
        const limit = 4;

        const productData = await Product.find({
            productName: { $regex: search, $options: 'i' }
        })
            .limit(limit)
            .skip((page - 1) * limit)
            .populate('category')
            .exec();

        const count = await Product.countDocuments({
            productName: { $regex: search, $options: 'i' }
        });

        const category = await Category.find({ isListed: true });

        res.render("products", {
            data: productData,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            cat: category,
            search: search,
            success_msg: req.flash('success_msg'),
            error_msg: req.flash('error_msg'),
        });

    } catch (error) {
        console.error(error);
        res.redirect("/admin/pageerror");
    }
};


const addProductOffer = async (req, res) => {
    try {
        const { productId, percentage } = req.body;

        if (percentage > 100) {
            return res.json({ status: false, message: "Offer percentage cannot exceed 100%" });
        }

        if (percentage < 1) {
            return res.json({ status: false, message: "Offer percentage must be at least 1%" });
        }

        const findProduct = await Product.findOne({ _id: productId });
        const findCategory = await Category.findOne({ _id: findProduct.category });

        if (findCategory.categoryOffer > percentage) {
            return res.json({ status: false, message: "This product category already has a category offer" });
        }


        findProduct.salePrice = findProduct.regularPrice * (1 - percentage / 100);
        findProduct.productOffer = parseInt(percentage);
        await findProduct.save();


        findCategory.categoryOffer = 0;
        await findCategory.save();

        return res.json({ status: true });
    } catch (error) {
        console.error("Error in addProductOffer:", error);
        return res.status(500).json({ status: false, message: "Internal server error" });
    }
};


const removeProductOffer = async (req, res) => {
    try {
        const { productId } = req.body;
        const findProduct = await Product.findOne({ _id: productId });
        const percentage = findProduct.productOffer;
        findProduct.salePrice = findProduct.salePrice + Math.floor(findProduct.regularPrice * (percentage / 100));
        findProduct.productOffer = 0;
        await findProduct.save();
        res.json({ status: true });

    } catch (error) {
        res.redirect("/admin/pageerror");
    }
}

const blockProduct = async (req, res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({ _id: id }, { $set: { isBlocked: true } });
        req.flash('success_msg', 'Product blocked successfully.');
        res.redirect("/admin/products");
    } catch (error) {
        req.flash('error_msg', 'Failed to block the product.');
        res.redirect("/admin/pageerror");
    }
}
const unblockProduct = async (req, res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({ _id: id }, { $set: { isBlocked: false } });
        req.flash('success_msg', 'Product unblocked successfully.');
        res.redirect("/admin/products");
    } catch (error) {
        req.flash('error_msg', 'Failed to unblock the product.');
        res.redirect("/admin/pageerror");
    }
}

const getEditProduct = async (req, res) => {
    try {

        const id = req.query.id;
        const product = await Product.findOne({ _id: id });
        const category = await Category.find({});
        res.render("edit-product", {
            product: product,
            cat: category,
        })
    } catch (error) {
        res.redirect("/admin/pageerror");
    }
}

const editProduct = async (req, res) => {
    try {
        const id = req.params.id;
        const data = req.body;


        const existingProduct = await Product.findOne({
            productName: data.productName,
            _id: { $ne: id }
        });

        if (existingProduct) {
            req.flash('error_msg', 'Product with this name already exists');
            return res.redirect('/admin/editProduct?id=' + id);
        }


        let variants = [];
        try {
            variants = JSON.parse(data.variants);
            if (!Array.isArray(variants)) throw new Error('Invalid variants format');
        } catch (error) {
            console.error('Error parsing variants:', error);
            req.flash('error_msg', 'Invalid variants data');
            return res.redirect('/admin/editProduct?id=' + id);
        }

        
        const images = [];
        if (req.files && req.files.length > 0) {
            for (let i = 0; i < req.files.length; i++) {
                images.push(req.files[i].filename);
            }
        }


        const updateData = {
            productName: data.productName,
            description: data.descriptionData,
            category: data.category,
            regularPrice: parseFloat(data.regularPrice),
            salePrice: parseFloat(data.salePrice),
            variants: variants
        };


        if (images.length > 0) {
            updateData.$push = { productImage: { $each: images } };
        }


        const updatedProduct = await Product.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedProduct) {
            req.flash('error_msg', 'Product not found');
            return res.redirect('/admin/products');
        }

        req.flash('success_msg', 'Product updated successfully');
        res.redirect('/admin/products');

    } catch (error) {
        console.error('Error updating product:', error);
        req.flash('error_msg', 'Error updating product');
        res.redirect('/admin/pageerror');
    }
};

const deleteSingleImage = async (req, res) => {
    try {
        const { imageNameToServer, productIdToServer } = req.body;
        const product = await Product.findByIdAndUpdate(productIdToServer, { $pull: { productImage: imageNameToServer } });
        const imagePath = path.join("public", "uploads", "re-image", imageNameToServer);

        if (fs.existsSync(imagePath)) {
            await fs.unlinkSync(imagePath);
            console.log(`Image ${imageNameToServer} deleted successfully`);
        } else {
            console.log(`Image ${imageNameToServer} not found`);
        }

        res.send({ status: true });

    } catch (error) {
        res.redirect("/admin/pageerror");
    }
}

module.exports = {
    getProductAddPage,
    addProducts,
    getAllProducts,
    addProductOffer,
    removeProductOffer,
    blockProduct,
    unblockProduct,
    getEditProduct,
    editProduct,
    deleteSingleImage
}